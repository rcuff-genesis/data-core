import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { getDatabasePoolConfig, isDatabaseConfigured } from "./config";

let pool: Pool | null = null;

export function getDatabasePool(): Pool {
  if (!pool) {
    pool = new Pool(getDatabasePoolConfig());
  }

  return pool;
}

export async function getDatabaseClient(): Promise<PoolClient> {
  return getDatabasePool().connect();
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[],
): Promise<QueryResult<T>> {
  return getDatabasePool().query<T>(text, values);
}

export { isDatabaseConfigured };
