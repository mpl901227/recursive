"use client"

import { useState, useCallback } from "react"
import { createLLMClient } from "@/lib/llm-api"

interface LLMMessage {
  role: "user" | "assistant" | "system"
  content: string
}

export function useLLM(provider: "openai" | "anthropic" | "local" = "openai") {
  const [client] = useState(() => createLLMClient(provider))
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generateText = useCallback(
    async (messages: LLMMessage[], model = "gpt-4") => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await client.generateText(messages, { model })
        return response
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error"
        setError(errorMessage)
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [client],
  )

  const streamText = useCallback(
    async (messages: LLMMessage[], model = "gpt-4", onChunk: (chunk: string) => void) => {
      setIsLoading(true)
      setError(null)

      try {
        await client.streamText(messages, { model, stream: true }, onChunk)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error"
        setError(errorMessage)
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [client],
  )

  return {
    generateText,
    streamText,
    isLoading,
    error,
  }
}
