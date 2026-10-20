// Tiny D1 stand-in on top of node:sqlite so the worker's real SQL (and the real migrations) run in vitest.
// Not a test file. Used by the P4__*.test.ts repros.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const MIGRATIONS = ["0001_init.sql", "0002_error_detail.sql", "0003_error_log.sql", "0004_media.sql", "0005_place_galleries.sql", "0006_saves_trips.sql", "0007_kv_cache.sql", "0008_trip_booking_state.sql", "0009_shares.sql", "0010_accounts.sql", "0011_checks_origin_and_indexes.sql", "0012_place_profiles.sql", "0013_ops.sql"];

type Param = string | number | null;

class FakeStatement {
  constructor(private db: DatabaseSync, private sql: string, private params: Param[] = []) {}
  bind(...params: unknown[]) {
    for (const p of params) if (p === undefined) throw new Error("D1_TYPE_ERROR: Type 'undefined' not supported for value 'undefined'");
    return new FakeStatement(this.db, this.sql, params as Param[]);
  }
  async first<T>(col?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.params) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (col ? row[col] : row) as T;
  }
  async all<T>(): Promise<{ results: T[]; success: true; meta: {} }> {
    return { results: this.db.prepare(this.sql).all(...this.params) as T[], success: true, meta: {} };
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...this.params);
    return { success: true as const, results: [], meta: { changes: Number(r.changes) } };
  }
  _exec() {
    return this.db.prepare(this.sql).run(...this.params);
  }
}

export function fakeD1(root = join(HERE, "..", "..")): D1Database & { raw: DatabaseSync } {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const m of MIGRATIONS) db.exec(readFileSync(join(root, "migrations", m), "utf8"));
  const fake = {
    raw: db,
    prepare: (sql: string) => new FakeStatement(db, sql),
    async batch(statements: FakeStatement[]) {
      // D1 batches are one transaction.
      db.exec("BEGIN");
      try {
        const out = statements.map((s) => ({ success: true as const, results: [], meta: { changes: Number(s._exec().changes) } }));
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    dump: () => {
      throw new Error("not implemented");
    },
    exec: async (sql: string) => {
      db.exec(sql);
      return { count: 1, duration: 0 };
    },
    withSession: () => {
      throw new Error("not implemented");
    },
  };
  return fake as unknown as D1Database & { raw: DatabaseSync };
}
