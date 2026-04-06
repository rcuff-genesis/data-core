import type { ToolExecutionContext, ToolResult } from "../ai/types";
import type { Document } from "../ontology/entities";

export async function searchDocuments(
  context: ToolExecutionContext,
  query: string,
  limit = 10,
): Promise<ToolResult<Document[]>> {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return {
      ok: false,
      data: null,
      message: "A non-empty document query is required.",
    };
  }

  const documents = await context.entityStore.searchDocuments(
    normalizedQuery,
    limit,
  );

  return {
    ok: true,
    data: documents,
  };
}
