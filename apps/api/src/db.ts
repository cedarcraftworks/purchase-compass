import postgres from "postgres";

export type Sql = postgres.Sql;
export type TxSql = postgres.TransactionSql;

export function createDb(url: string, max: number): Sql {
  return postgres(url, {
    max,
    // Fail a request quickly rather than queueing forever when the pool is exhausted.
    connect_timeout: 10,
    idle_timeout: 30,
    // Keep column names as written in SQL; mapping to camelCase is explicit in queries.
    transform: { undefined: null },
    onnotice: () => {},
  });
}
