"use client"

import { X, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Tab {
  id: string
  name: string
  isDirty: boolean
  isActive: boolean
  type: "project" | "admin"
}

interface TabBarProps {
  activeTab: string
  onTabChange: (tabId: string) => void
  onNewTab: () => void
}

export function TabBar({ activeTab, onTabChange, onNewTab }: TabBarProps) {
  const tabs: Tab[] = [
    { id: "project-1", name: "My App", isDirty: true, isActive: activeTab === "project-1", type: "project" },
    { id: "project-2", name: "Website", isDirty: false, isActive: activeTab === "project-2", type: "project" },
    { id: "admin", name: "System Admin", isDirty: false, isActive: activeTab === "admin", type: "admin" },
  ]

  return (
    <div className="h-10 bg-gray-100 border-b border-gray-200 flex items-center px-2">
      <div className="flex items-center space-x-1 flex-1">
        {tabs
          .filter((tab) => tab.type === "project")
          .map((tab) => (
            <div
              key={tab.id}
              className={`
              flex items-center space-x-2 px-3 py-1.5 rounded-t-lg cursor-pointer transition-colors
              ${
                tab.isActive
                  ? "bg-gradient-to-r from-sky-300 to-green-300 text-white"
                  : "bg-gray-200 text-gray-600 hover:bg-gray-300"
              }
            `}
              onClick={() => onTabChange(tab.id)}
            >
              <span className="text-sm font-medium">{tab.name}</span>
              {tab.isDirty && <div className="w-1.5 h-1.5 bg-current rounded-full opacity-70"></div>}
              <Button
                variant="ghost"
                size="sm"
                className="w-4 h-4 p-0 hover:bg-black/10"
                onClick={(e) => {
                  e.stopPropagation()
                  // Handle tab close
                }}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          ))}

        <Button variant="ghost" size="sm" onClick={onNewTab} className="w-8 h-8 p-0 text-gray-500 hover:text-gray-700">
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {/* Admin Tab (Fixed Right) */}
      <div className="flex items-center">
        {tabs
          .filter((tab) => tab.type === "admin")
          .map((tab) => (
            <div
              key={tab.id}
              className={`
              flex items-center space-x-2 px-3 py-1.5 rounded-t-lg cursor-pointer transition-colors ml-4
              ${tab.isActive ? "bg-gray-800 text-white" : "bg-gray-600 text-gray-200 hover:bg-gray-700"}
            `}
              onClick={() => onTabChange(tab.id)}
            >
              <span className="text-sm font-medium">{tab.name}</span>
              <Button
                variant="ghost"
                size="sm"
                className="w-4 h-4 p-0 hover:bg-black/10"
                onClick={(e) => {
                  e.stopPropagation()
                  // Handle tab close
                }}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          ))}
      </div>
    </div>
  )
}
