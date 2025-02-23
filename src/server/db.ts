import type { PGInterface } from './server.ts';

export async function cleanupDatabase(client: PGInterface) {
  const sqlTables = [
    'users',
    'sessions',
    'rooms',
    'room_events',
    'room_users',
    'database_migrations',
  ];
  const sqlTypes = ['VISIBILITY'];
  let sqlCommands = [];
  sqlCommands = sqlCommands.concat(
    sqlTables.map(
      (tableName) => `DROP TABLE IF EXISTS "${tableName}" CASCADE ;`
    )
  );
  sqlCommands = sqlCommands.concat(
    sqlTypes.map((typeName) => `DROP TYPE IF EXISTS ${typeName} CASCADE ;`)
  );
  for (const sqlCommand of sqlCommands) {
    await client.query(sqlCommand);
  }
}

export async function initializeDatabase(client: PGInterface) {
  const sqlCommands = [
    // Users table.
    // * Guest users have NULL email.
    // * On registration, email_verification_code and expiry are set.
    // * is_guest remains set until the email is verified.
    `CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NULL,
        hashed_password VARCHAR(255) NULL,
        alias VARCHAR(100) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        is_guest BOOLEAN NOT NULL DEFAULT FALSE,
        email_verification_code VARCHAR(100) NULL,
        email_verification_code_expiry TIMESTAMP WITH TIME ZONE NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        active_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE UNIQUE INDEX unique_email_not_null ON users (email) WHERE email IS NOT NULL;`,
    `CREATE INDEX idx_users_is_active ON users (is_active);`,
    `CREATE INDEX idx_users_is_guest ON users (is_guest);`,
    `CREATE INDEX idx_users_active_at ON users (active_at);`,

    // Sessions tracks associated users for each session cookie.
    `CREATE TABLE sessions (
        session_id TEXT PRIMARY KEY,
        user_id INTEGER NULL, -- Foreign key to users table, can be NULL if not logged in
        expiry_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
        session_data JSONB NULL, -- To store session specific data, can be NULL if no data to store
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );`,
    `CREATE INDEX idx_sessions_expiry ON sessions (expiry_timestamp);`,
    `CREATE INDEX idx_sessions_user_id ON sessions (user_id);`,

    `CREATE TYPE VISIBILITY AS ENUM('public', 'friends', 'private')`,
    `CREATE TABLE rooms (
        id SERIAL PRIMARY KEY,
        creator_user_id INTEGER NOT NULL,
        name VARCHAR(255) NOT NULL,
        url VARCHAR(255) NOT NULL,
        base_url VARCHAR(255) NULL,
        description TEXT NULL,
        visibility VISIBILITY NOT NULL DEFAULT 'public',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (creator_user_id) REFERENCES users(id) ON DELETE CASCADE
    );`,
    `CREATE INDEX idx_rooms_base_url ON rooms (base_url);`,
    `CREATE INDEX idx_rooms_visibility ON rooms (visibility);`,

    `CREATE TABLE room_events (
        id BIGSERIAL PRIMARY KEY,
        room_id INTEGER NOT NULL,
        user_id INTEGER NULL,
        event_type VARCHAR(255) NOT NULL, -- Type of event (e.g., 'user_joined', 'message', 'action')
        event_data JSONB NULL,      -- JSON data specific to the event
        event_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP, -- Timestamp of when event occurred (for ordering)
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE, -- If room is deleted, delete room events
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL   -- If user is deleted, set user_id in event to NULL (keep event history)
    );`,

    `CREATE TABLE room_users (
        room_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (room_id, user_id),
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );`,

    // Track applied migrations of the database.
    `CREATE TABLE database_migrations (
        version_number INTEGER PRIMARY KEY,
        applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        description TEXT NULL -- Optional: description of the migration
    );`,
    // Insert the initial version (e.g., version 0 or 1) when you first set up the database
    `INSERT INTO database_migrations (version_number, description) VALUES (1, 'Initial schema creation');`,
  ];
  for (const sqlCommand of sqlCommands) {
    await client.query(sqlCommand);
  }
}

export class Database {
  #client: PGInterface;

  constructor(client: PGInterface) {
    this.#client = client;
  }
}
