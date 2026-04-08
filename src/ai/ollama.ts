import "server-only";

export interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: OllamaToolCall[];
}

export interface OllamaTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

interface OllamaChatResponse {
  message?: {
    role?: string;
    content?: string;
    tool_calls?: OllamaToolCall[];
  };
}

export type ToolExecutor = (
  name: string,
  args: Record<string, unknown>,
) => Promise<string>;

function getOllamaConfig(): { baseUrl: string; model: string } {
  return {
    baseUrl: process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
    model: process.env.OLLAMA_MODEL ?? "llama3.1:8b",
  };
}

async function callOllama(
  messages: OllamaMessage[],
  tools?: OllamaTool[],
): Promise<OllamaChatResponse> {
  const { baseUrl, model } = getOllamaConfig();

  const body: Record<string, unknown> = { model, stream: false, messages };

  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      text
        ? `Ollama request failed with status ${response.status}: ${text}`
        : `Ollama request failed with status ${response.status}.`,
    );
  }

  return (await response.json()) as OllamaChatResponse;
}

export async function chatWithOllama(messages: OllamaMessage[]): Promise<string> {
  const payload = await callOllama(messages);
  const content = payload.message?.content?.trim();

  if (!content) {
    throw new Error("Ollama returned an empty response.");
  }

  return content;
}

export interface ToolCallLogEntry {
  tool: string;
  args: Record<string, unknown>;
  resultSummary: string;
}

export async function chatWithOllamaToolLoop(
  messages: OllamaMessage[],
  tools: OllamaTool[],
  executor: ToolExecutor,
  maxRounds = 8,
): Promise<{ answer: string; toolCallLog: ToolCallLogEntry[] }> {
  const history: OllamaMessage[] = [...messages];
  const toolCallLog: ToolCallLogEntry[] = [];

  for (let round = 0; round < maxRounds; round++) {
    const payload = await callOllama(history, tools);
    const message = payload.message;

    if (!message) {
      throw new Error("Ollama returned an empty message.");
    }

    const toolCalls = message.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      const content = message.content?.trim();

      if (!content) {
        throw new Error("Ollama returned an empty response with no tool calls.");
      }

      return { answer: content, toolCallLog };
    }

    // Append the assistant's tool-call message to history
    history.push({
      role: "assistant",
      content: message.content ?? "",
      tool_calls: toolCalls,
    });

    // Execute each tool call and append results
    for (const toolCall of toolCalls) {
      const { name, arguments: args } = toolCall.function;
      let result: string;

      try {
        result = await executor(name, args);
      } catch (err) {
        result = JSON.stringify({
          error: err instanceof Error ? err.message : "Tool execution failed",
        });
      }

      toolCallLog.push({
        tool: name,
        args,
        resultSummary: result.slice(0, 200),
      });

      history.push({
        role: "tool",
        content: result,
      });
    }
  }

  throw new Error(
    `Agent loop exceeded ${maxRounds} rounds without producing a final answer.`,
  );
}
