// Execute production SQL against SQLite, including transaction rollback, without cloud access.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
export class D1 {
  constructor({ migrate = true } = {}) {
    this.sql = new DatabaseSync(':memory:');
    this.sql.exec(readFileSync('migrations/0001_push_base.sql', 'utf8'));
    if (migrate) this.migrate();
  }
  migrate() { this.sql.exec(readFileSync('migrations/0002_push_delivery.sql', 'utf8')); }
  prepare(query) {
    const sql = this.sql;
    return {
      values: [],
      bind(...values) { this.values = values; return this; },
      async run() { const result = sql.prepare(query).run(...this.values); return { meta: { changes: result.changes } }; },
      async first() { return sql.prepare(query).get(...this.values) ?? null; },
      async all() { return { results: sql.prepare(query).all(...this.values) }; }
    };
  }
  async batch(statements) {
    this.sql.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sql.exec('COMMIT');
      return results;
    } catch (error) { this.sql.exec('ROLLBACK'); throw error; }
  }
  close() { this.sql.close(); }
}
