import { PGlite } from '@electric-sql/pglite';
import type { Results, QueryOptions } from '@electric-sql/pglite';
import type { PGInterface } from '../../src/server/types.ts';
import { MockClock } from './clock.ts';

export class MockDB implements PGInterface {
  #db = new PGlite();
  #clock: MockClock;
  #baseDate: Date = new Date();
  #lastNow: number = 0;

  constructor(clock: MockClock, baseDate?: Date) {
    this.#clock = clock;
    if (baseDate) {
      this.#baseDate = baseDate;
    }
  }

  async initialize() {
    await this.#db.query(`CREATE SCHEMA IF NOT EXISTS test_override;`);
    await this.#db.query(`SET search_path = test_override, pg_catalog, public;`);
    await this.#db.query(`CREATE TEMPORARY TABLE mock_time (time TIMESTAMP WITH TIME ZONE);`);
    await this.#db.query(`INSERT INTO mock_time (time) VALUES ($1);`, [this.#baseDate.toISOString()]);
    await this.#db.query(`CREATE OR REPLACE FUNCTION test_override.now() RETURNS TIMESTAMP WITH TIME ZONE AS $$
      SELECT time FROM mock_time LIMIT 1;
  $$ LANGUAGE sql;`);
    await this.#db.query(`CREATE OR REPLACE FUNCTION test_override.clock_timestamp() RETURNS TIMESTAMP WITH TIME ZONE AS $$
      SELECT time FROM mock_time LIMIT 1;
  $$ LANGUAGE sql;`);
    await this.#db.query(`CREATE OR REPLACE FUNCTION test_override.statement_timestamp() RETURNS TIMESTAMP WITH TIME ZONE AS $$
      SELECT time FROM mock_time LIMIT 1;
  $$ LANGUAGE sql;`);
  }

  async query<T>(
    query: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    params?: any[],
    options?: QueryOptions
  ): Promise<Results<T>> {
    const currentNow = this.#clock.now();
    // Before any query that could use the current time, update the mock_time if needed.
    if (currentNow != this.#lastNow) {
      const currentTime = new Date(this.#baseDate.getTime() + currentNow);
      await this.#db.query(`UPDATE mock_time SET time = $1;`, [currentTime.toISOString()]);
      this.#lastNow = currentNow;
    }
    return this.#db.query<T>(query, params, options);
  }

  async close() {
    await this.#db.close();
  }
}
