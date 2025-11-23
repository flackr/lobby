import { PGlite } from '@electric-sql/pglite';
import type { Results, QueryOptions } from '@electric-sql/pglite';
import type { PGInterface } from '../../src/server/types.ts';
import { MockClock } from './clock.ts';

type MockDBSettings = {
  clock: MockClock;
  baseDate: Date;
  setup: (db: PGInterface) => Promise<void>;
}

export class MockDB implements PGInterface {
  #settings: MockDBSettings = {
    clock: new MockClock({ autoAdvance: true }),
    baseDate: new Date(),
    setup: async (db: PGInterface) => {},
  }
  #db = new PGlite();
  #lastNow: number = 0;
  initialized: Promise<void>;

  constructor(settings?: Partial<MockDBSettings>) {
    this.#settings = { ...this.#settings, ...settings };
    this.initialized = this.initialize();
  }

  async initialize() {
    await this.#db.query(`CREATE SCHEMA IF NOT EXISTS test_override;`);
    await this.#db.query(`SET search_path = test_override, pg_catalog, public;`);
    await this.#db.query(`CREATE TEMPORARY TABLE mock_time (time TIMESTAMP WITH TIME ZONE);`);
    await this.#db.query(`INSERT INTO mock_time (time) VALUES ($1);`,
      [(new Date(this.#settings.baseDate.getTime() + this.#settings.clock.now())).toISOString()]);
    await this.#db.query(`CREATE OR REPLACE FUNCTION test_override.now() RETURNS TIMESTAMP WITH TIME ZONE AS $$
      SELECT time FROM mock_time LIMIT 1;
  $$ LANGUAGE sql;`);
    await this.#db.query(`CREATE OR REPLACE FUNCTION test_override.clock_timestamp() RETURNS TIMESTAMP WITH TIME ZONE AS $$
      SELECT time FROM mock_time LIMIT 1;
  $$ LANGUAGE sql;`);
    await this.#db.query(`CREATE OR REPLACE FUNCTION test_override.statement_timestamp() RETURNS TIMESTAMP WITH TIME ZONE AS $$
      SELECT time FROM mock_time LIMIT 1;
  $$ LANGUAGE sql;`);
    await this.#settings.setup(this.#db);
  }

  async query<T>(
    query: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    params?: any[],
    options?: QueryOptions
  ): Promise<Results<T>> {
    await this.initialized;
    const currentNow = this.#settings.clock.now();
    // Before any query that could use the current time, update the mock_time if needed.
    if (currentNow != this.#lastNow) {
      const currentTime = new Date(this.#settings.baseDate.getTime() + currentNow);
      await this.#db.query(`UPDATE mock_time SET time = $1;`, [currentTime.toISOString()]);
      this.#lastNow = currentNow;
    }
    return this.#db.query<T>(query, params, options);
  }

  async close() {
    await this.#db.close();
  }
}
