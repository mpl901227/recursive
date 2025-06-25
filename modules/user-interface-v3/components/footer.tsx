"use client"

import { ChevronUp, Plus, Code, Database, Globe, Terminal, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useState } from "react"

interface MCPTool {
  id: string
  name: string
  icon: any
  description: string
  status: "active" | "inactive" | "running"
}

interface FooterProps {
  expanded: boolean
  onToggle: () => void
  onToolAdd: (tool: string) => void
  onToolExecute: (tool: string) => void
}

export function Footer({ expanded, onToggle, onToolAdd, onToolExecute }: FooterProps) {
  const [tools] = useState<MCPTool[]>([
    { id: "code", name: "Code Editor", icon: Code, description: "Edit and manage code files", status: "active" },
    { id: "db", name: "Database", icon: Database, description: "Database operations and queries", status: "inactive" },
    { id: "web", name: "Web Server", icon: Globe, description: "Local development server", status: "running" },
    { id: "terminal", name: "Terminal", icon: Terminal, description: "Command line interface", status: "active" },
    { id: "tools", name: "Dev Tools", icon: Wrench, description: "Development utilities", status: "inactive" },
  ])

  const getStatusColor = (status: MCPTool["status"]) => {
    switch (status) {
      case "active":
        return "text-green-500"
      case "running":
        return "text-blue-500 animate-pulse"
      default:
        return "text-gray-400"
    }
  }

  return (
    <footer className={`bg-white border-t border-gray-200 transition-all duration-300 ${expanded ? "h-32" : "h-12"}`}>
      {/* Toggle Button */}
      <div className="h-12 flex items-center justify-between px-4">
        <div className="flex items-center space-x-2">
          <Button variant="ghost" size="sm" onClick={onToggle}>
            <ChevronUp className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </Button>
          <span className="text-sm text-gray-600">MCP Tools</span>
        </div>

        {/* Tool Icons (Always Visible) */}
        <div className="flex items-center space-x-1">
          {tools.map((tool) => {
            const Icon = tool.icon
            return (
              <Button
                key={tool.id}
                variant="ghost"
                size="sm"
                className="w-8 h-8 p-0"
                onClick={() => onToolExecute(tool.name)}
                title={tool.name}
              >
                <Icon className={`w-4 h-4 ${getStatusColor(tool.status)}`} />
              </Button>
            )
          })}

          <Button
            variant="ghost"
            size="sm"
            className="w-8 h-8 p-0 text-gray-400 hover:text-gray-600"
            onClick={() => onToolAdd("New Tool")}
            title="Add Tool"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="h-20 px-4 pb-4 overflow-y-auto">
          <div className="grid grid-cols-5 gap-4 h-full">
            {tools.map((tool) => {
              const Icon = tool.icon
              return (
                <div
                  key={tool.id}
                  className="flex flex-col items-center justify-center p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => onToolExecute(tool.name)}
                >
                  <Icon className={`w-5 h-5 mb-1 ${getStatusColor(tool.status)}`} />
                  <span className="text-xs font-medium text-gray-700">{tool.name}</span>
                  <span className="text-xs text-gray-500 text-center leading-tight">{tool.description}</span>
                </div>
              )
            })}

            <div
              className="flex flex-col items-center justify-center p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors border-2 border-dashed border-gray-300"
              onClick={() => onToolAdd("New Tool")}
            >
              <Plus className="w-5 h-5 mb-1 text-gray-400" />
              <span className="text-xs font-medium text-gray-500">Add Tool</span>
            </div>
          </div>
        </div>
      )}
    </footer>
  )
}
