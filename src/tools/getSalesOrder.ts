import type { SalesOrderReadModel, ToolExecutionContext, ToolResult } from "../ai/types";

export async function getSalesOrder(
  context: ToolExecutionContext,
  salesOrderId: string,
): Promise<ToolResult<SalesOrderReadModel>> {
  const salesOrder = await context.entityStore.getSalesOrderById(salesOrderId);

  if (!salesOrder) {
    return {
      ok: false,
      data: null,
      message: `Sales order not found for id "${salesOrderId}".`,
    };
  }

  return {
    ok: true,
    data: salesOrder,
  };
}
