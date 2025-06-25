"use client"

import { useState, useEffect } from "react"
import { Send, ImageIcon, ArrowLeftRight, SplitSquareHorizontal, Bot, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useWebSocket } from "@/hooks/use-websocket"
import { useLLM } from "@/hooks/use-llm"
import { SystemAdmin } from "@/components/system-admin"

interface Message {
  id: string
  type: "user" | "assistant"
  content: string
  timestamp: Date
}

interface MainContentProps {
  layoutMode: "normal" | "split" | "swapped"
  onLayoutChange: (mode: "normal" | "split" | "swapped") => void
  onMessage: (message: string) => void
  onShowModal: (title: string, content: string) => void
  activeTab: string
}

export function MainContent({ layoutMode, onLayoutChange, onMessage, onShowModal, activeTab }: MainContentProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      type: "assistant",
      content:
        "Hello! I'm your AI assistant. I can help you with coding, project management, and system administration. What would you like to work on today?",
      timestamp: new Date(),
    },
  ])
  const [inputValue, setInputValue] = useState("")
  const [mode, setMode] = useState<"agent" | "ask">("agent")
  const [model, setModel] = useState("gpt-4")
  const [isInputExpanded, setIsInputExpanded] = useState(false)
  const [streamingMessage, setStreamingMessage] = useState("")

  const { isConnected, connectionStatus, sendMessage, onMessage: onWebSocketMessage } = useWebSocket()
  const { generateText, streamText, isLoading } = useLLM()

  useEffect(() => {
    // Listen for WebSocket messages
    onWebSocketMessage("llm_response", (data) => {
      const aiResponse: Message = {
        id: Date.now().toString(),
        type: "assistant",
        content: data.content,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, aiResponse])
    })

    onWebSocketMessage("workflow_update", (data) => {
      onMessage(`Workflow updated: ${data.step}`)
    })
  }, [onWebSocketMessage, onMessage])

  const handleSend = async () => {
    if (!inputValue.trim()) return

    const userMessage: Message = {
      id: Date.now().toString(),
      type: "user",
      content: inputValue,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    onMessage(inputValue)

    const currentInput = inputValue
    setInputValue("")
    setIsInputExpanded(false)

    try {
      if (mode === "agent") {
        // Send to WebSocket for agent mode
        sendMessage("user_message", {
          content: currentInput,
          mode: "agent",
          model,
        })
      } else {
        // Use streaming for ask mode
        const streamingId = (Date.now() + 1).toString()
        const streamingMsg: Message = {
          id: streamingId,
          type: "assistant",
          content: "",
          timestamp: new Date(),
        }

        setMessages((prev) => [...prev, streamingMsg])

        await streamText(
          [
            { role: "system", content: "You are a helpful AI assistant." },
            { role: "user", content: currentInput },
          ],
          model,
          (chunk) => {
            setMessages((prev) =>
              prev.map((msg) => (msg.id === streamingId ? { ...msg, content: msg.content + chunk } : msg)),
            )
          },
        )
      }
    } catch (error) {
      console.error("Failed to send message:", error)
      onMessage("Failed to send message")
    }
  }

  // Show System Admin for admin tab
  if (activeTab === "admin") {
    return <SystemAdmin onMessage={onMessage} />
  }

  return (
    <div className="flex-1 flex flex-col bg-white">
      {/* Layout Controls */}
      <div className="h-10 bg-gradient-to-r from-green-50 via-sky-50 to-green-50 border-b border-gray-200 flex items-center justify-between px-4">
        <div className="flex items-center space-x-1">
          <Button
            variant={layoutMode === "normal" ? "default" : "ghost"}
            size="sm"
            onClick={() => onLayoutChange("normal")}
            className="w-8 h-8 p-0"
            title="Normal Layout"
          >
            <div className="w-4 h-3 border border-current"></div>
          </Button>
          <Button
            variant={layoutMode === "split" ? "default" : "ghost"}
            size="sm"
            onClick={() => onLayoutChange("split")}
            className="w-8 h-8 p-0"
            title="Split Layout"
          >
            <SplitSquareHorizontal className="w-4 h-4" />
          </Button>
          <Button
            variant={layoutMode === "swapped" ? "default" : "ghost"}
            size="sm"
            onClick={() => onLayoutChange("swapped")}
            className="w-8 h-8 p-0"
            title="Swap Layout"
          >
            <ArrowLeftRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Connection Status */}
        <div className="flex items-center space-x-2">
          <div
            className={`w-2 h-2 rounded-full ${
              connectionStatus === "connected"
                ? "bg-green-500"
                : connectionStatus === "connecting"
                  ? "bg-yellow-500 animate-pulse"
                  : "bg-red-500"
            }`}
          ></div>
          <span className="text-xs text-gray-600 capitalize">{connectionStatus}</span>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex items-start space-x-3 ${
              message.type === "user" ? "flex-row-reverse space-x-reverse" : ""
            }`}
          >
            <div
              className={`
              w-8 h-8 rounded-full flex items-center justify-center
              ${
                message.type === "user"
                  ? "bg-blue-500 text-white"
                  : "bg-gradient-to-br from-sky-300 to-green-300 text-white"
              }
            `}
            >
              {message.type === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>
            <div
              className={`
              max-w-3xl p-3 rounded-lg
              ${message.type === "user" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-800"}
            `}
            >
              <p className="text-sm">{message.content}</p>
              <p className="text-xs opacity-70 mt-1">{message.timestamp.toLocaleTimeString()}</p>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center space-x-2 text-gray-500">
            <div className="animate-spin w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full"></div>
            <span className="text-sm">AI is thinking...</span>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-gray-200 p-4">
        <div className="flex items-end space-x-2">
          <div className="flex-1">
            <Textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={`${mode === "agent" ? "Tell me what to do and I'll execute it..." : "Ask me anything..."}`}
              className={`resize-none transition-all duration-200 ${isInputExpanded ? "min-h-[120px]" : "min-h-[40px]"}`}
              onClick={() => setIsInputExpanded(true)}
              onBlur={() => {
                if (!inputValue.trim()) {
                  setIsInputExpanded(false)
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              disabled={isLoading}
            />
          </div>
          <div className="flex flex-col space-y-2">
            <Button variant="ghost" size="sm" className="h-10 w-10">
              <ImageIcon className="w-4 h-4" />
            </Button>
            <Button onClick={handleSend} disabled={!inputValue.trim() || isLoading} className="h-10 w-10">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center space-x-2">
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="w-32 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gpt-4">GPT-4</SelectItem>
                <SelectItem value="claude">Claude</SelectItem>
                <SelectItem value="gemini">Gemini</SelectItem>
              </SelectContent>
            </Select>

            <Select value={mode} onValueChange={(value: "agent" | "ask") => setMode(value)}>
              <SelectTrigger className="w-24 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="agent">Agent</SelectItem>
                <SelectItem value="ask">Ask</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="text-xs text-gray-500">
            <span className="font-medium">{mode === "agent" ? "Execute Mode" : "Advisory Mode"}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
