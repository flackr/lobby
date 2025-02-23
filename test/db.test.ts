import { describe, expect, test } from '@jest/globals';
import { PGlite } from '@electric-sql/pglite';

import { cleanupDatabase, initializeDatabase } from '../src/server/db';

describe('database', () => {
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
