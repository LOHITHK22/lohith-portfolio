// Minimal types for the parts of sql.js the engine tests use (sql.js ships no type definitions).
declare module "sql.js" {
  type Value = string | number | null | Uint8Array;
  export interface QueryExecResult { columns: string[]; values: Value[][] }
  export interface Database { run(sql: string): Database; exec(sql: string): QueryExecResult[]; close(): void }
  export interface SqlJsStatic { Database: new () => Database }
  export default function initSqlJs(config?: { locateFile?: (file: string) => string }): Promise<SqlJsStatic>;
}
