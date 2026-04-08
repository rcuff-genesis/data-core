import type { PoolConfig } from "pg";

export function isDatabaseConfigured(): boolean {
  return Boolean(
    hasDiscreteDatabaseConfig() || process.env.DATABASE_URL,
  );
}

export function getDatabasePoolConfig(): PoolConfig {
  if (!isDatabaseConfigured()) {
    throw new Error(
      "Database is not configured. Set DATABASE_URL or DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD.",
    );
  }

  const sslMode = process.env.DB_SSL_MODE ?? "require";
  const ssl =
    sslMode === "disable"
      ? false
      : {
          rejectUnauthorized: false,
        };

  if (hasDiscreteDatabaseConfig()) {
    return {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT ?? "5432"),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl,
      max: 10,
    };
  }

  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl,
      max: 10,
    };
  }

  throw new Error(
    "Database is not configured. Set DATABASE_URL or DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD.",
  );
}

function hasDiscreteDatabaseConfig(): boolean {
  return Boolean(
    process.env.DB_HOST &&
      process.env.DB_PORT &&
      process.env.DB_NAME &&
      process.env.DB_USER &&
      process.env.DB_PASSWORD,
  );
}
