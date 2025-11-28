import { MockClock } from "./clock.ts";
import { MockDB } from "./db.ts";
import { initializeDatabase } from '../../src/server/db.ts';
import type { PGInterface } from '../../src/server/types.ts';
import { MockEnvironment } from "./environment.ts";
import { MockTransport } from "./transport.ts";
import { Server } from "../../src/server/server.ts";

const clock = new MockClock({ autoAdvance: true });
const lobbyDb = new MockDB({ clock,
  setup: async (db: PGInterface) => {
    await initializeDatabase(db);
    // Add a few safe names for testing.
    await db.query(`INSERT INTO safe_names VALUES ('alice'), ('bob'), ('cathy'), ('donald')`);
  }
});
const createLobbyServer = (environment: MockEnvironment) => {
  const hostname = 'example.com';
  const sender = 'no-reply@example.com';
  const transport = new MockTransport();
  const clientServer = environment.createClient({ address: hostname });
  return {
    server: new Server({
        hostname,
        port: 8000,
        emailFrom: sender,
        safeNames: true,
        db: lobbyDb,
        clock: environment.clock.api(),
        transport: transport,
        createServer: clientServer.createServer,
        /* Small limits to speed up limit testing */
        limits: {
            maxCreatedUsersPerIPPerHour: 5,
            maxVerificationEmailsPerIPPerHour: 5,
            maxVerificationEmailsPerHour: 10,
            verificationCodeMinutes: 30,
        }
    }),
    transport
  }
}

export { lobbyDb, clock, createLobbyServer };
