import type { EntityStore, ToolExecutionContext } from "./types";
import { PostgresEntityStore } from "../storage/postgresEntityStore";

export function createToolExecutionContext(
  entityStore: EntityStore = new PostgresEntityStore(),
): ToolExecutionContext {
  return {
    entityStore,
  };
}
