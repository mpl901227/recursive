"use client"

import type React from "react"

import { Search, Settings, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useState } from "react"

interface HeaderProps {
  onSearch: (query: string) => void
}

export function Header({ onSearch }: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [searchMode, setSearchMode] = useState<"global" | "project">("global")

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    onSearch(searchQuery)
  }

  return (
    <header className="h-12 bg-white border-b border-gray-200 flex items-center px-4 shadow-sm">
      {/* Logo */}
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 bg-gradient-to-br from-sky-300 to-green-300 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-lg">R</span>
        </div>
      </div>

      {/* Search */}
      <div className="flex-1 max-w-2xl mx-8">
        <form onSubmit={handleSearch} className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            type="text"
            placeholder={searchMode === "global" ? "Search all projects..." : "Search in current project..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-20 bg-gray-50 border-gray-200"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setSearchMode(searchMode === "global" ? "project" : "global")}
            className="absolute right-1 top-1/2 transform -translate-y-1/2 text-xs"
          >
            {searchMode === "global" ? "Global" : "Project"}
          </Button>
        </form>
      </div>

      {/* User Area */}
      <div className="flex items-center space-x-3">
        <Button variant="ghost" size="sm">
          <Settings className="w-4 h-4" />
        </Button>
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-green-400 rounded-full"></div>
          <span className="text-sm text-gray-600">Connected</span>
        </div>
        <Button variant="ghost" size="sm">
          <User className="w-4 h-4" />
          <span className="ml-1 text-sm">user@example.com</span>
        </Button>
      </div>
    </header>
  )
}
