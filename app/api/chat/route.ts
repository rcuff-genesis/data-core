import { answerDataQuestion } from "@/src/ai/chatService";

export const runtime = "nodejs";

interface ChatRequestBody {
  messages?: Array<{
    role?: "user" | "assistant";
    content?: string;
  }>;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequestBody;
    const messages = (body.messages ?? []).filter(
      (message): message is { role: "user" | "assistant"; content: string } =>
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
