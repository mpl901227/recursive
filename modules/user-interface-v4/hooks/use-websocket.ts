"use client"

import { useEffect, useState, useCallback } from "react"
import { WebSocketClient } from "@/lib/websocket-client"

export function useWebSocket() {
  const [client] = useState(() => new WebSocketClient())
  const [isConnected, setIsConnected] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "disconnected">("disconnected")

  useEffect(() => {
    client.onConnection((connected) => {
      setIsConnected(connected)
      setConnectionStatus(connected ? "connected" : "disconnected")
    })

    setConnectionStatus("connecting")
    client.connect().catch((error) => {
      console.error("Failed to connect to WebSocket:", error)
      setConnectionStatus("disconnected")
    })

    return () => {
      client.disconnect()
    }
  }, [client])

  const sendMessage = useCallback(
    (type: string, data: any) => {
      client.send(type, data)
    },
    [client],
  )

  const onMessage = useCallback(
    (type: string, handler: (data: any) => void) => {
      client.onMessage(type, handler)
    },
    [client],
  )

  return {
    isConnected,
    connectionStatus,
    sendMessage,
    onMessage,
  }
}
