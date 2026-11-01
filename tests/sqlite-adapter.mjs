// SPDX-License-Identifier: Apache-2.0
// Async adapter over node:sqlite matching the expo-sqlite subset Leafellow uses.
// This proves SQL behavior against real SQLite; it is not native device evidence.
import { DatabaseSync } from 'node:sqlite';

export class NodeSqliteDatabase {
  constructor(filename) {
    this.db = new DatabaseSync(filename);
    this.statements = [];
  }
  async execAsync(sql) {
    this.statements.push(sql);
    this.db.exec(sql);
  }
  async runAsync(sql, ...params) {
    this.statements.push(sql);
    return this.db.prepare(sql).run(...params);
  }
  async getFirstAsync(sql, ...params) {
    this.statements.push(sql);
    return this.db.prepare(sql).get(...params) ?? null;
  }
  async getAllAsync(sql, ...params) {
    this.statements.push(sql);
    return this.db.prepare(sql).all(...params);
  }
  close() {
    this.db.close();
  }
}
