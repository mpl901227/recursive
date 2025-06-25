interface LLMMessage {
  role: "user" | "assistant" | "system"
  content: string
}

interface LLMResponse {
  content: string
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

interface LLMConfig {
  model: string
  temperature?: number
  max_tokens?: number
  stream?: boolean
}

export class LLMApiClient {
  private baseUrl: string
  private apiKey: string

  constructor(baseUrl = "/api/llm", apiKey = "") {
    this.baseUrl = baseUrl
    this.apiKey = apiKey
  }

  async generateText(messages: LLMMessage[], config: LLMConfig = { model: "gpt-4" }): Promise<LLMResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
        },
        body: JSON.stringify({
          messages,
          ...config,
        }),
      })

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status} ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error("LLM API request failed:", error)
      throw error
    }
  }

  async streamText(
    messages: LLMMessage[],
    config: LLMConfig = { model: "gpt-4", stream: true },
    onChunk: (chunk: string) => void,
  ): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey && { Authorization: `Bearer ${this.apiKey}` }),
        },
        body: JSON.stringify({
          messages,
          ...config,
        }),
      })

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status} ${response.statusText}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error("No response body reader available")
      }

      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split("\n")

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6)
            if (data === "[DONE]") {
              return
            }
            try {
              const parsed = JSON.parse(data)
              if (parsed.content) {
                onChunk(parsed.content)
              }
            } catch (error) {
              console.warn("Failed to parse streaming chunk:", error)
            }
          }
        }
      }
    } catch (error) {
      console.error("LLM streaming request failed:", error)
      throw error
    }
  }
}

// Factory function for different LLM providers
export function createLLMClient(provider: "openai" | "anthropic" | "local" = "openai"): LLMApiClient {
  switch (provider) {
    case "openai":
      return new LLMApiClient("/api/llm/openai")
    case "anthropic":
      return new LLMApiClient("/api/llm/anthropic")
    case "local":
      return new LLMApiClient("/api/llm/local")
    default:
      return new LLMApiClient()
  }
}
