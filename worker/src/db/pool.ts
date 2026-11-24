import pg from "pg";

// numeric -> string by default in pg; keep it (exact decimals), bigint (int8) -> number is safe for our ids.
pg.types.setTypeParser(20, (v) => Number(v));

export type Db = pg.Pool;
export type Queryable = pg.Pool | pg.PoolClient;

export function createPool(connectionString: string): pg.Pool {
  const pool = new pg.Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 30_000,
    application_name: "pretzuri-worker",
    // extensions holds pg_trgm (similarity, %). Candidate retrieval uses the default `%` threshold (0.3);
    // final scores are recomputed in JS against settings.match_auto / match_review.
    options: "-c search_path=public,extensions -c statement_timeout=300000",
  });
  return pool;
}
