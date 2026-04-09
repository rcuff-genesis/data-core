import "server-only";

import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from "pg";

type WalnutMetadataRow = {
  database_name: string;
  schema_name: string;
  version: string;
};

type WalnutTableRow = {
  table_name: string;
};

let walnutPool: Pool | null = null;

export interface WalnutConnectionStatus {
  configured: boolean;
  reachable: boolean;
  database?: string;
  schema?: string;
  version?: string;
  tableCount?: number;
  sampleTables?: string[];
  error?: string;
}

export function isWalnutConfigured(): boolean {
  return Boolean(
    hasDiscreteWalnutConfig() || process.env.WALNUT_DATABASE_URL,
  );
}

export function getWalnutPoolConfig(): PoolConfig {
  if (!isWalnutConfigured()) {
    throw new Error(
      "Walnut database is not configured. Set WALNUT_DATABASE_URL or WALNUT_DB_HOST/WALNUT_DB_PORT/WALNUT_DB_NAME/WALNUT_DB_USER/WALNUT_DB_PASSWORD.",
    );
  }

  const sslMode = process.env.WALNUT_DB_SSL_MODE ?? "require";
  const ssl =
    sslMode === "disable"
      ? false
      : {
          rejectUnauthorized: false,
        };

  if (hasDiscreteWalnutConfig()) {
    return {
      host: process.env.WALNUT_DB_HOST,
      port: Number(process.env.WALNUT_DB_PORT ?? "5432"),
      database: process.env.WALNUT_DB_NAME,
      user: process.env.WALNUT_DB_USER,
      password: process.env.WALNUT_DB_PASSWORD,
      ssl,
      max: 5,
    };
  }

  return {
    connectionString: process.env.WALNUT_DATABASE_URL,
    ssl,
    max: 5,
  };
}

export function getWalnutPool(): Pool {
  if (!walnutPool) {
    walnutPool = new Pool(getWalnutPoolConfig());
  }

  return walnutPool;
}

export async function queryWalnut<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: unknown[],
): Promise<QueryResult<T>> {
  return getWalnutPool().query<T>(text, values);
}

export async function getWalnutConnectionStatus(): Promise<WalnutConnectionStatus> {
  if (!isWalnutConfigured()) {
    return {
      configured: false,
      reachable: false,
      error:
        "Missing WALNUT database env vars. Set WALNUT_DATABASE_URL or WALNUT_DB_HOST/WALNUT_DB_PORT/WALNUT_DB_NAME/WALNUT_DB_USER/WALNUT_DB_PASSWORD.",
    };
  }

  const schema = process.env.WALNUT_DB_SCHEMA ?? "public";

  try {
    const [metadataResult, tablesResult] = await Promise.all([
      queryWalnut<WalnutMetadataRow>(
        `
          SELECT
            current_database() AS database_name,
            current_schema() AS schema_name,
            version() AS version
        `,
      ),
      queryWalnut<WalnutTableRow>(
        `
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = $1
            AND table_type = 'BASE TABLE'
          ORDER BY table_name ASC
        `,
        [schema],
      ),
    ]);

    const metadata = metadataResult.rows[0];

    return {
      configured: true,
      reachable: true,
      database: metadata?.database_name,
      schema: metadata?.schema_name ?? schema,
      version: metadata?.version,
      tableCount: tablesResult.rows.length,
      sampleTables: tablesResult.rows.slice(0, 12).map((row) => row.table_name),
    };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not connect to the Walnut database.",
    };
  }
}

function hasDiscreteWalnutConfig(): boolean {
  return Boolean(
    process.env.WALNUT_DB_HOST &&
      process.env.WALNUT_DB_PORT &&
      process.env.WALNUT_DB_NAME &&
      process.env.WALNUT_DB_USER &&
      process.env.WALNUT_DB_PASSWORD,
  );
}
