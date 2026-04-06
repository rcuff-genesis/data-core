import type { ToolExecutionContext, ToolResult } from "../ai/types";
import type { Company } from "../ontology/entities";

export async function getCompany(
  context: ToolExecutionContext,
  companyId: string,
): Promise<ToolResult<Company>> {
  const company = await context.entityStore.getCompanyById(companyId);

  if (!company) {
    return {
      ok: false,
      data: null,
      message: `Company not found for id "${companyId}".`,
    };
  }

  return {
    ok: true,
    data: company,
  };
}
