import type { ToolExecutionContext, ToolResult } from "../ai/types";
import type { Deal } from "../ontology/entities";

export async function getDeal(
  context: ToolExecutionContext,
  dealId: string,
): Promise<ToolResult<Deal>> {
  const deal = await context.entityStore.getDealById(dealId);

  if (!deal) {
    return {
      ok: false,
      data: null,
      message: `Deal not found for id "${dealId}".`,
    };
  }

  return {
    ok: true,
    data: deal,
  };
}
