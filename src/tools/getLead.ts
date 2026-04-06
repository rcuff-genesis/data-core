import type { ToolExecutionContext, ToolResult } from "../ai/types";
import type { Lead } from "../ontology/entities";

export async function getLead(
  context: ToolExecutionContext,
  leadId: string,
): Promise<ToolResult<Lead>> {
  const lead = await context.entityStore.getLeadById(leadId);

  if (!lead) {
    return {
      ok: false,
      data: null,
      message: `Lead not found for id "${leadId}".`,
    };
  }

  return {
    ok: true,
    data: lead,
  };
}
