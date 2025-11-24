import { MockClock } from "./clock.ts";
import { MockDB } from "./db.ts";
import { initializeDatabase } from '../../src/server/db.ts';
import type { PGInterface } from '../../src/server/types.ts';

const clock = new MockClock({ autoAdvance: true });
const lobbyDb = new MockDB({ clock,
  setup: async (db: PGInterface) => {
    await initializeDatabase(db);
    // Add a few safe names for testing.
    await db.query(`INSERT INTO safe_names VALUES ('Alice'), ('Bob'), ('Cathy'), ('Donald')`);
  }
});

export { lobbyDb, clock };
