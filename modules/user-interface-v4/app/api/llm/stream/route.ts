import type { NextRequest } from "next/server"

interface LLMMessage {
  role: "user" | "assistant" | "system"
  content: string
}

interface LLMRequest {
  messages: LLMMessage[]
  model: string
  temperature?: number
  max_tokens?: number
}

export async function POST(request: NextRequest) {
  try {
    const body: LLMRequest = await request.json()
    const { messages, model } = body

    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      start(controller) {
        const mockResponse = `This is a streaming response from ${model}. User said: "${messages[messages.length - 1]?.content}"`
        const words = mockResponse.split(" ")

        let index = 0
        const interval = setInterval(() => {
          if (index < words.length) {
            const chunk = words[index] + " "
            const data = `data: ${JSON.stringify({ content: chunk })}\n\n`
            controller.enqueue(encoder.encode(data))
            index++
          } else {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"))
            controller.close()
            clearInterval(interval)
          }
        }, 100)
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (error) {
    console.error("LLM streaming error:", error)
    return new Response("Internal server error", { status: 500 })
  }
}
