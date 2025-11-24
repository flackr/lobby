import { describe, expect, test } from '@jest/globals';
import { PGlite } from '@electric-sql/pglite';

import { cleanupDatabase, initializeDatabase } from '../../src/server/db';
import { MockDB } from './db.ts';
import { MockClock } from './clock.ts';

describe('database', () => {
  test('Overrides now() function correctly', async () => {
    const clock = new MockClock();
    const db = new MockDB({clock});
    const results1 = await db.query<{ now: string }>(`SELECT now();`);
    const time1 = new Date(results1.rows[0].now);

    // Create a table with automatic timestamp to verify time is consistent.
    await db.query(`CREATE TABLE test_times (id SERIAL PRIMARY KEY, created_at TIMESTAMP WITH TIME ZONE DEFAULT now());`);
    const insertResults = await db.query<{ id: number }>(`INSERT INTO test_times DEFAULT VALUES RETURNING id;`);
    const rowId = insertResults.rows[0].id;
    const timeResults = await db.query<{ created_at: string }>(`SELECT created_at FROM test_times WHERE id = $1;`, [rowId]);
    const createdAt = new Date(timeResults.rows[0].created_at);
    expect(createdAt.getTime()).toEqual(time1.getTime());

    // Advance the clock by 5 minutes.
    await clock.advanceBy(5 * 60 * 1000);
    const results2 = await db.query<{ now: string }>(`SELECT now();`);
    const time2 = new Date(results2.rows[0].now);
    expect(time2.getTime() - time1.getTime()).toEqual(5 * 60 * 1000);

    // Insert another row and verify the timestamp.
    const insertResults2 = await db.query<{ id: number }>(`INSERT INTO test_times DEFAULT VALUES RETURNING id;`);
    const rowId2 = insertResults2.rows[0].id;
    const timeResults2 = await db.query<{ created_at: string }>(`SELECT created_at FROM test_times WHERE id = $1;`, [rowId2]);
    const createdAt2 = new Date(timeResults2.rows[0].created_at);
    expect(createdAt2.getTime()).toEqual(time2.getTime());
    await db.close();
  });

  test('Initializes the database and cleans it up correctly', async () => {
    const db = new PGlite();
    interface IName {
      name: string;
    }
    interface IId {
      oid: number;
    }
    const owner = (await db.query<IName>(`SELECT user AS name FROM user;`))
      .rows[0].name;
    const oid = (
      await db.query<IId>(`SELECT oid FROM pg_authid WHERE rolname = $1;`, [
        owner,
      ])
    ).rows[0].oid;
    const tableQuery = `SELECT tablename AS name FROM pg_catalog.pg_tables WHERE schemaname = 'public';`;
    const typeQuery = `SELECT typname as name FROM pg_catalog.pg_type WHERE typowner = $1;`;
    let tables = (await db.query<IName>(tableQuery)).rows.map(
      (row) => row.name
    );
    let originalTypes = new Set(
      (await db.query<IName>(typeQuery, [oid])).rows.map((row) => row.name)
    );
    // No tables or types initially
    expect(tables.length).toEqual(0);

    // This is a destructive test, so use a separate db instance.
    await initializeDatabase(db);
    tables = (await db.query<IName>(tableQuery)).rows.map((row) => row.name);
    // Initializing the data should have created some tables.
    expect(tables.length).toBeGreaterThan(0);

    await cleanupDatabase(db);
    tables = (await db.query<IName>(tableQuery)).rows.map((row) => row.name);
    // Initializing the data should have created some tables.
    expect(tables).toEqual([]);
    let newTypes = (await db.query<IName>(typeQuery, [oid])).rows
      .map((row) => row.name)
      .filter((name) => !originalTypes.has(name));
    expect(newTypes).toEqual([]);
    await db.close();
  });
});
