import type { ToolExecutionContext, ToolResult } from "../ai/types";
import type { Account } from "../ontology/entities";

export async function getAccount(
  context: ToolExecutionContext,
  accountId: string,
): Promise<ToolResult<Account>> {
  const account = await context.entityStore.getAccountById(accountId);

  if (!account) {
    return {
      ok: false,
      data: null,
      message: `Account not found for id "${accountId}".`,
    };
  }

  return {
    ok: true,
    data: account,
  };
}
