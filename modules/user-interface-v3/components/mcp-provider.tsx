"use client"

import type React from "react"

import { createContext, useContext, useEffect, useState } from "react"

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
}

const MCPContext = createContext<MCPContextType | null>(null)

export function MCPProvider({ children }: { children: React.ReactNode }) {
  const [isConnected, setIsConnected] = useState(false)
  const [messages, setMessages] = useState<MCPMessage[]>([])

  useEffect(() => {
    // Simulate MCP connection
    const timer = setTimeout(() => {
      setIsConnected(true)
    }, 1000)

    return () => clearTimeout(timer)
  }, [])

  const sendMessage = (message: MCPMessage) => {
    setMessages((prev) => [...prev, message])

    // Simulate message processing
    console.log("MCP Message:", message)

    // Simulate response for certain methods
    if (message.method === "ui/sidebar/toggle") {
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            jsonrpc: "2.0",
            method: "ui/sidebar/toggled",
            params: { success: true },
            id: message.id,
          },
        ])
      }, 100)
    }
  }

  return <MCPContext.Provider value={{ sendMessage, isConnected, messages }}>{children}</MCPContext.Provider>
}

export function useMCP() {
  const context = useContext(MCPContext)
  if (!context) {
    throw new Error("useMCP must be used within MCPProvider")
  }
  return context
}
