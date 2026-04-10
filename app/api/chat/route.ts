import { answerDataQuestion } from "@/src/ai/chatService";
import {
  appendChatMessage,
  compactChatSession,
  ensureChatSession,
  getChatSessionContext,
  getChatSessionMessages,
} from "@/src/ai/chatMemoryStore";
import type { ToolCallLogEntry } from "@/src/ai/types";

export const runtime = "nodejs";

interface ChatRequestBody {
  sessionId?: string;
  message?: string;
  messages?: Array<{
    role?: "user" | "assistant";
    content?: string;
    toolCallLog?: ToolCallLogEntry[];
  }>;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = normalizeSessionId(searchParams.get("sessionId"));

    if (!sessionId) {
      return Response.json(
        {
          ok: false,
          error: "A sessionId is required.",
        },
        { status: 400 },
      );
    }

    const messages = await getChatSessionMessages(sessionId);

    return Response.json({
      ok: true,
      sessionId,
      messages,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Failed to load chat session.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequestBody;
    const sessionId =
      normalizeSessionId(body.sessionId) ?? crypto.randomUUID();
    const directMessage =
      typeof body.message === "string" ? body.message.trim() : "";

    if (directMessage) {
      await ensureChatSession(sessionId);
      await appendChatMessage(sessionId, {
        role: "user",
        content: directMessage,
      });

      const sessionContext = await getChatSessionContext(sessionId);
      const messages = [
        ...(sessionContext.summary
          ? [
              {
                role: "assistant" as const,
                content: `Conversation summary:\n${sessionContext.summary}`,
              },
            ]
          : []),
        ...sessionContext.messages,
      ];

      const response = await answerDataQuestion(messages);

      await appendChatMessage(sessionId, {
        role: "assistant",
        content: response.answer,
        toolCallLog: response.toolCallLog,
        chart: response.chart,
      });
      await compactChatSession(sessionId);

      return Response.json({
        ok: true,
        sessionId,
        response,
      });
    }

    const messages = (body.messages ?? []).filter(
      (
        message,
      ): message is {
        role: "user" | "assistant";
        content: string;
        toolCallLog?: ToolCallLogEntry[];
      } =>
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string",
    );

    if (messages.length === 0) {
      return Response.json(
        {
          ok: false,
          error: "At least one message is required.",
        },
        { status: 400 },
      );
    }

    const response = await answerDataQuestion(messages);

    return Response.json({
      ok: true,
      sessionId,
      response,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Failed to answer question.",
      },
      { status: 500 },
    );
  }
}

function normalizeSessionId(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}
