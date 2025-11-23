import { MockClock } from "./clock.ts";
import { MockDB } from "./db.ts";
import { initializeDatabase } from '../../src/server/db.ts';

const clock = new MockClock({ autoAdvance: true });
const lobbyDb = new MockDB({ clock,
  setup: initializeDatabase
});

export { lobbyDb, clock };
